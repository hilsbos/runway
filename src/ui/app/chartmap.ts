/**
 * Runway — map engine output (GrowthResult / GrowthPoint[] / ScalingEvent[])
 * into the plain prop shapes the chart primitives expect. Keeps the views thin
 * and the charts model-free.
 */
import type {
  GrowthResult,
  ScalingEvent,
  DbScaleCurve,
} from "../../model/index.ts";
import type {
  CostSeries,
  CostEventMarker,
  LatencyPoint,
  UtilizationPoint,
  ComparisonSeries,
  DbScaleSeries,
} from "../charts/index.ts";

const TIER_SHORT: Record<string, string> = {
  lb: "LB",
  api: "API",
  cache: "cache",
  datastore: "DB",
  authz: "authz",
};

export function toCostSeries(g: GrowthResult, name: string, key = "this"): CostSeries[] {
  return [
    {
      key,
      name,
      points: g.points.map((p) => ({ month: p.month, usd: p.total })),
    },
  ];
}

export function toLatencyPoints(g: GrowthResult): LatencyPoint[] {
  return g.points.map((p) => ({ month: p.month, p50: p.p50, p99: p.p99 }));
}

export function toUtilPoints(g: GrowthResult): UtilizationPoint[] {
  return g.points.map((p) => {
    const point: UtilizationPoint = { month: p.month };
    if (p.utils.lb != null) point.lb = p.utils.lb;
    if (p.utils.api != null) point.api = p.utils.api;
    if (p.utils.cache != null) point.cache = p.utils.cache;
    if (p.utils.datastore != null) point.datastore = p.utils.datastore;
    if (p.utils.authz != null) point.authz = p.utils.authz;
    return point;
  });
}

export function toEventMarkers(events: ScalingEvent[]): CostEventMarker[] {
  return events.map((e) => ({
    month: e.month,
    kind: e.kind,
    label: `${TIER_SHORT[e.tier] ?? e.tier} ${e.kind === "breaking" ? "wall" : "hot"}`,
  }));
}

/** A comparison series of a chosen per-month scalar, with this design's events. */
export function toComparisonSeries(
  g: GrowthResult,
  id: string,
  name: string,
  metric: "total" | "p99",
): ComparisonSeries {
  return {
    key: id,
    name,
    points: g.points.map((p) => ({ month: p.month, value: p[metric] })),
    events: g.events.map((e) => ({
      month: e.month,
      kind: e.kind,
      label: `${name}: ${TIER_SHORT[e.tier] ?? e.tier}`,
    })),
  };
}

/**
 * Map datastore scaling curves into the chart's series shape, plotting a chosen
 * per-point scalar ("nodes" or "cost") against load (rps). Carries each store's
 * write wall through so the chart can mark a single-primary store past it.
 */
export function toDbScaleSeries(
  curves: DbScaleCurve[],
  metric: "nodes" | "cost",
): DbScaleSeries[] {
  return curves.map((c) => ({
    key: c.db,
    name: c.label,
    points: c.points.map((p) => ({ rps: p.rps, value: p[metric] })),
    writeWallRps: c.facts.writeCeilingRps,
  }));
}
