import { describe, it, expect } from "vitest";
import { computeStack } from "../stack.ts";
import { simulateGrowth } from "../growth.ts";
import {
  sanitizeInputs,
  sanitizeGrowth,
  sanitizeOverrides,
} from "../sanitize.ts";
import { defaultInputs, TEMPLATES } from "../presets.ts";
import type { BaseStackInputs, GrowthInputs, StackInputs } from "../types.ts";

/** Recursively assert every numeric leaf in a result is finite (no NaN/±Inf). */
function expectAllFinite(obj: unknown, path = "root"): void {
  if (typeof obj === "number") {
    expect(Number.isFinite(obj), `${path} = ${obj}`).toBe(true);
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      expectAllFinite(v, `${path}.${k}`);
    }
  }
}

const base = (): StackInputs => defaultInputs("aws");

describe("sanitize — finding 1-5: out-of-spec inputs never break the engine", () => {
  const evilCases: Array<[string, Partial<StackInputs>]> = [
    ["cores=0 (Infinity apiNodes)", { cores: 0 }],
    ["cores=-5 (negative nodes)", { cores: -5 }],
    ["rps=0 (apiNodes=0)", { rps: 0 }],
    ["rps negative", { rps: -1000 }],
    ["ramGB=0 (Infinity memUtil)", { ramGB: 0 }],
    ["ramGB negative", { ramGB: -4 }],
    ["readFrac=-0.5 (inverts traffic)", { readFrac: -0.5 }],
    ["readFrac=1.5 (>1)", { readFrac: 1.5 }],
    ["hitRatio=1.5 (manufactures gets)", { hitRatio: 1.5 }],
    ["hitRatio negative", { hitRatio: -0.3 }],
    ["NaN rps", { rps: NaN }],
    ["Infinity rps", { rps: Infinity }],
  ];

  for (const [label, over] of evilCases) {
    it(`${label} -> finite, sane, non-negative result`, () => {
      const r = computeStack({ ...base(), ...over });
      expectAllFinite(r);
      // node counts non-negative + HA mins respected
      expect(r.lbNodes).toBeGreaterThanOrEqual(2);
      expect(r.apiNodes).toBeGreaterThanOrEqual(1);
      expect(r.dbNodes).toBeGreaterThanOrEqual(1);
      expect(r.cacheNodes).toBeGreaterThanOrEqual(0);
      // util/cost/mem never Infinity or negative
      expect(r.maxUtil).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.memUtil).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.memUtil)).toBe(true);
    });
  }

  it("sanitizeInputs clamps each field to the contract", () => {
    const s = sanitizeInputs({
      ...base(),
      rps: 0,
      cores: 0,
      ramGB: 0,
      readFrac: -0.5,
      hitRatio: 1.5,
    });
    expect(s.rps).toBe(1);
    expect(s.cores).toBe(1);
    expect(s.ramGB).toBe(1);
    expect(s.readFrac).toBe(0.5);
    expect(s.hitRatio).toBe(0.99);
  });

  it("does NOT cap rps above (constraint A)", () => {
    const s = sanitizeInputs({ ...base(), rps: 50_000_000 });
    expect(s.rps).toBe(50_000_000);
  });

  it("clamps authz config fields too", () => {
    const s = sanitizeInputs({
      ...base(),
      authz: {
        enabled: false,
        alg: "ecdsa",
        ttl: 0,
        tokensPerReq: 100,
        vcache: true,
        rev: "push",
        regions: 0,
        aclTuples: -5,
      },
    });
    expect(s.authz.ttl).toBe(30);
    expect(s.authz.tokensPerReq).toBe(4);
    expect(s.authz.regions).toBe(1);
    expect(s.authz.aclTuples).toBe(1);
  });
});

describe("sanitize — constraint B: identity for in-spec inputs", () => {
  it("defaultInputs produce IDENTICAL output before/after sanitize", () => {
    const inp = base();
    expect(JSON.stringify(computeStack(inp))).toBe(
      JSON.stringify(computeStack(sanitizeInputs(inp))),
    );
    expect(sanitizeInputs(inp)).toEqual(inp);
  });

  for (const t of TEMPLATES) {
    it(`TEMPLATE "${t.id}" is unchanged by sanitize (identity)`, () => {
      const inp: StackInputs = { ...t.inputs, rps: 100_000 };
      expect(sanitizeInputs(inp)).toEqual(inp);
      expect(JSON.stringify(computeStack(inp))).toBe(
        JSON.stringify(computeStack(sanitizeInputs(inp))),
      );
    });
  }
});

describe("sanitizeOverrides — finding 3 & 4: untrusted override map", () => {
  it("drops a zero-divisor override {target_util:0}", () => {
    const clean = sanitizeOverrides({ target_util: 0 });
    // 0 is below editable min 0.5 -> clamped, not dropped
    expect(clean.target_util).toBe(0.5);
  });

  it("drops an unknown key {'evil.path':1}", () => {
    const clean = sanitizeOverrides({ "evil.path": 1 });
    expect(clean["evil.path"]).toBeUndefined();
    expect(Object.keys(clean)).toHaveLength(0);
  });

  it("drops non-finite override values", () => {
    const clean = sanitizeOverrides({
      target_util: NaN,
      "pg.write": Infinity,
    });
    expect(Object.keys(clean)).toHaveLength(0);
  });

  it("passes a VALID in-range override through unchanged", () => {
    const clean = sanitizeOverrides({ "pg.write": 16000 });
    expect(clean["pg.write"]).toBe(16000);
  });

  it("clamps an out-of-range editable override to its [min,max]", () => {
    // pg.write editable [2000, 100000]
    expect(sanitizeOverrides({ "pg.write": 999999 })["pg.write"]).toBe(100000);
    expect(sanitizeOverrides({ "pg.write": 1 })["pg.write"]).toBe(2000);
  });

  it("a {target_util:0} override does not produce Infinity in the result", () => {
    const r = computeStack(base(), { target_util: 0 });
    expectAllFinite(r);
  });

  it("resolve defensively ignores a non-finite override (constants.ts)", () => {
    // even if a non-finite slips past sanitize, resolve falls back to base.
    const r = computeStack(base(), { target_util: NaN });
    expectAllFinite(r);
  });
});

describe("sanitizeGrowth — constraint A: growth still drives rps high", () => {
  const baseGrowth: GrowthInputs = {
    startRps: 20_000,
    model: "exponential",
    ratePerYear: 0.6,
    horizonMonths: 36,
  };

  // §3.3 teaching curve: Postgres monolith breaks at month 18.
  const pgBase: BaseStackInputs = {
    ...TEMPLATES.find((t) => t.id === "postgres-monolith")!.inputs,
  };

  it("known scaling-event month is unchanged (no upper cap on rps)", () => {
    const g = simulateGrowth(pgBase, baseGrowth);
    expect(g.runwayMonths).toBe(18);
    // rps grows monotonically and uncapped past the starting load: the final
    // month's rps is the full exponential, not clamped down to some ceiling.
    const last = g.points[g.points.length - 1]!;
    expect(last.rps).toBeGreaterThan(baseGrowth.startRps * 4); // 1.6^3 ≈ 4.096x
    expectAllFinite(g);
  });

  it("sanitizeGrowth does NOT cap startRps above", () => {
    const s = sanitizeGrowth({ ...baseGrowth, startRps: 9_000_000 });
    expect(s.startRps).toBe(9_000_000);
  });

  it("clamps startRps lower bound + rate/horizon", () => {
    const s = sanitizeGrowth({
      startRps: 0,
      model: "exponential",
      ratePerYear: 99,
      horizonMonths: 1000,
    });
    expect(s.startRps).toBe(1);
    expect(s.ratePerYear).toBe(3);
    expect(s.horizonMonths).toBe(60);
  });

  it("identity for in-spec growth inputs", () => {
    expect(sanitizeGrowth(baseGrowth)).toEqual(baseGrowth);
  });

  it("out-of-spec growth still produces a finite trajectory", () => {
    const g = simulateGrowth(pgBase, {
      startRps: -50,
      model: "exponential",
      ratePerYear: -2,
      horizonMonths: 3,
    });
    expectAllFinite(g);
    expect(g.points.length).toBe(7); // horizon clamped to min 6 (+ month 0)
  });
});
