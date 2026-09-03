/**
 * Runway — growth over time (`simulateGrowth`). Sweeps `computeStack` across
 * a month-indexed load curve to produce trajectories and dated scaling events.
 * See MODEL-SPEC §3.2. Pure & deterministic (integer month axis, 0 = today).
 */
import type {
  BaseStackInputs,
  GrowthInputs,
  GrowthPoint,
  GrowthResult,
  ScalingEvent,
  StackResult,
} from "./types.ts";
import { computeStack } from "./stack.ts";
import { sanitizeGrowth } from "./sanitize.ts";

function pointFromSnap(month: number, rps: number, snap: StackResult): GrowthPoint {
  return {
    month,
    rps,
    total: snap.total,
    p50: snap.p50,
    p99: snap.p99,
    maxUtil: snap.maxUtil,
    bottleneck: snap.bottleneck,
    status: snap.status,
    costs: snap.costs,
    nodes: {
      lb: snap.lbNodes,
      api: snap.apiNodes,
      cache: snap.cacheNodes,
      db: snap.dbNodes,
      authz: {
        iss: snap.authz.issNodes,
        ver: snap.authz.verNodes,
        sot: snap.authz.sotNodes,
      },
    },
    utils: snap.utils,
  };
}

export function simulateGrowth(
  base: BaseStackInputs,
  rawGrowth: GrowthInputs,
  overrides?: Record<string, number>,
): GrowthResult {
  // Boundary: clamp growth knobs (startRps lower-bound only — constraint A;
  // ratePerYear/horizonMonths to §6.2 bounds). `base` + `overrides` are
  // sanitized inside computeStack on each step. Identity for in-spec inputs.
  const growth = sanitizeGrowth(rawGrowth);
  const monthlyExp = (1 + growth.ratePerYear) ** (1 / 12);
  const points: GrowthPoint[] = [];
  const events: ScalingEvent[] = [];
  let prev: StackResult | null = null;
  let runwayMonths: number | null = null;

  for (let m = 0; m <= growth.horizonMonths; m++) {
    const rps = Math.round(
      growth.model === "exponential"
        ? growth.startRps * monthlyExp ** m
        : growth.startRps * (1 + growth.ratePerYear * (m / 12)),
    );
    const snap = computeStack({ ...base, rps }, overrides);
    points.push(pointFromSnap(m, rps, snap));

    // Treat "before month 0" as healthy so a design that is ALREADY bad/warn at
    // the starting load still emits an event at month 0 (otherwise a stack that
    // is broken from the start produces no event and reads as "healthy").
    const prevStatus = prev ? prev.status : "ok";
    if (prevStatus !== "bad" && snap.status === "bad") {
      events.push({
        month: m,
        rps,
        kind: "breaking",
        tier: snap.bottleneck,
        message: snap.message,
        runwayMonths: m,
      });
      if (runwayMonths === null) runwayMonths = m;
    } else if (prevStatus === "ok" && snap.status === "warn") {
      events.push({
        month: m,
        rps,
        kind: "warning",
        tier: snap.bottleneck,
        message: snap.message,
        runwayMonths: m,
      });
    }
    prev = snap;
  }

  return { points, events, runwayMonths, horizonMonths: growth.horizonMonths };
}
