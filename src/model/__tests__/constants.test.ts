import { describe, it, expect } from "vitest";
import { listConstants, resolve, CAPACITY, PRICE } from "../constants.ts";
import { TEMPLATES, defaultInputs } from "../presets.ts";
import { computeStack } from "../stack.ts";

describe("listConstants — generated assumptions rows", () => {
  const rows = listConstants();
  it("walks all constant trees and is non-trivial", () => {
    expect(rows.length).toBeGreaterThan(40);
  });
  it("includes nested datastore + price + alg paths", () => {
    const paths = new Set(rows.map((r) => r.path));
    expect(paths.has("pg.write")).toBe(true);
    expect(paths.has("cass.read")).toBe(true);
    expect(paths.has("PRICE.gcp.compute")).toBe(true);
    expect(paths.has("ALG.rsa.verify")).toBe(true);
    expect(paths.has("AUTHZ.lat_verify_call")).toBe(true);
  });
  it("every row carries value/unit/source", () => {
    for (const r of rows) {
      expect(typeof r.value).toBe("number");
      expect(typeof r.unit).toBe("string");
      expect(typeof r.source).toBe("string");
    }
  });
  it("matches default values (no override)", () => {
    expect(CAPACITY.target_util.value).toBe(0.7);
    expect(PRICE.aws.compute.value).toBe(1.0);
  });
});

describe("resolve — override merge by dotted path", () => {
  it("returns base value without override", () => {
    const g = resolve();
    expect(g("pg.write")).toBe(12000);
    expect(g("PRICE.gcp.compute")).toBe(0.97);
  });
  it("applies overrides", () => {
    const g = resolve({ "pg.write": 16000, "PRICE.gcp.compute": 0.9 });
    expect(g("pg.write")).toBe(16000);
    expect(g("PRICE.gcp.compute")).toBe(0.9);
    // untouched paths unaffected
    expect(g("cass.write")).toBe(50000);
  });
  it("throws on unknown path", () => {
    const g = resolve();
    expect(() => g("does.not.exist")).toThrow();
  });
});

describe("TEMPLATES — reference architectures compute cleanly", () => {
  it("all templates produce a finite total at default rps", () => {
    for (const t of TEMPLATES) {
      const r = computeStack({ ...t.inputs, rps: 50000 });
      expect(Number.isFinite(r.total)).toBe(true);
      expect(r.total).toBeGreaterThan(0);
    }
  });
  it("Postgres Monolith hits the write ceiling at high write load", () => {
    const t = TEMPLATES.find((x) => x.id === "postgres-monolith")!;
    const r = computeStack({ ...t.inputs, rps: 200000 });
    expect(r.writeCeiling).toBe(true);
    expect(r.status).toBe("bad");
  });
  it("no template enables the authz tier (authz removed from the simulation)", () => {
    for (const t of TEMPLATES) {
      expect(t.inputs.authz.enabled).toBe(false);
      const r = computeStack({ ...t.inputs, rps: 100000 });
      expect(r.utils.authz).toBeUndefined();
    }
  });
});

describe("defaultInputs", () => {
  it("honors provider arg", () => {
    expect(defaultInputs("gcp").provider).toBe("gcp");
    expect(defaultInputs().provider).toBe("aws");
  });
});
