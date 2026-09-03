import { describe, it, expect } from "vitest";
import {
  computeAuthzStandalone,
  type AuthzStandaloneInputs,
} from "../authz-standalone.ts";

/* Appendix A.2 standalone fixtures — full-scale (80M+ enforce). Exact on node
   counts + status; ±2% on money. These pin the ALG/AUTHZ constants. */

function base(over: Partial<AuthzStandaloneInputs> = {}): AuthzStandaloneInputs {
  return {
    users: 1e8,
    agents: 5,
    svc: 5,
    conc: 0.08,
    calls: 2,
    ttl: 300,
    alg: "ecdsa",
    lang: "rust",
    rev: "push",
    regions: 12,
    vcache: true,
    reserved: true,
    ...over,
  };
}

const pct = (got: number, exp: number) => Math.abs(got - exp) / exp;

describe("authz standalone — derived loads", () => {
  it("base: issuanceQPS 666,667, enforce 80M, liveTokens 200M", () => {
    const r = computeAuthzStandalone(base());
    expect(Math.round(r.issuanceQPS)).toBe(666667);
    expect(r.enforceRPS).toBe(80_000_000);
    expect(r.liveTokens).toBe(200_000_000);
    expect(r.aclTuples).toBe(2.5e9);
  });
});

describe("authz standalone — A.2 golden rows", () => {
  it("base → iss15 ver18 sot5 $6468 stale3 ok", () => {
    const r = computeAuthzStandalone(base());
    expect(r.issNodes).toBe(15);
    expect(r.verNodes).toBe(18);
    expect(r.sotNodes).toBe(5);
    expect(pct(r.cost, 6468)).toBeLessThan(0.02);
    expect(r.staleness).toBe(3);
    expect(r.status).toBe("ok");
  });

  it("vcache=false → ver1361 $180994 bad", () => {
    const r = computeAuthzStandalone(base({ vcache: false }));
    expect(r.issNodes).toBe(15);
    expect(r.verNodes).toBe(1361);
    expect(r.sotNodes).toBe(5);
    expect(pct(r.cost, 180994)).toBeLessThan(0.02);
    expect(r.status).toBe("bad");
  });

  it("rsa → iss90 ver6 $14655 warn", () => {
    const r = computeAuthzStandalone(base({ alg: "rsa" }));
    expect(r.issNodes).toBe(90);
    expect(r.verNodes).toBe(6);
    expect(pct(r.cost, 14655)).toBeLessThan(0.02);
    expect(r.status).toBe("warn");
  });

  it("rsa + vcache=false → iss90 ver433 $70145 warn", () => {
    const r = computeAuthzStandalone(base({ alg: "rsa", vcache: false }));
    expect(r.issNodes).toBe(90);
    expect(r.verNodes).toBe(433);
    expect(pct(r.cost, 70145)).toBeLessThan(0.02);
    expect(r.status).toBe("warn");
  });

  it("ttl=60 → iss71 ver86 $22582 ok", () => {
    const r = computeAuthzStandalone(base({ ttl: 60 }));
    expect(r.issNodes).toBe(71);
    expect(r.verNodes).toBe(86);
    expect(pct(r.cost, 22582)).toBeLessThan(0.02);
    expect(r.status).toBe("ok");
  });

  it("ttl=3600 → iss2 ver2 $2700 ok", () => {
    const r = computeAuthzStandalone(base({ ttl: 3600 }));
    expect(r.issNodes).toBe(2);
    expect(r.verNodes).toBe(2);
    expect(pct(r.cost, 2700)).toBeLessThan(0.02);
    expect(r.status).toBe("ok");
  });

  it("users 1e9, agents 10, svc 10 → iss568 ver681 $164630 ok", () => {
    const r = computeAuthzStandalone(
      base({ users: 1e9, agents: 10, svc: 10 }),
    );
    expect(r.issNodes).toBe(568);
    expect(r.verNodes).toBe(681);
    expect(pct(r.cost, 164630)).toBeLessThan(0.02);
    expect(r.status).toBe("ok");
  });
});
