/**
 * Runway — candidate comparison (`compareDesigns`). Runs simulateGrowth for
 * each of 2–3 designs over a shared horizon and diffs runway / cost / latency.
 * See MODEL-SPEC §5.1. Pure & deterministic.
 */
import type {
  CompareResult,
  GrowthInputs,
  NamedDesign,
} from "./types.ts";
import { simulateGrowth } from "./growth.ts";

export function compareDesigns(
  designs: NamedDesign[],
  growth: GrowthInputs,
  overrides?: Record<string, number>,
): CompareResult {
  const perDesign = designs.map((d) => {
    const g = simulateGrowth(d.inputs, growth, overrides);
    const last = g.points[g.points.length - 1];
    if (!last) {
      throw new Error(`Design ${d.id} produced no growth points`);
    }
    const cumulativeCost = g.points.reduce((sum, p) => sum + p.total, 0);
    return {
      id: d.id,
      name: d.name,
      runwayMonths: g.runwayMonths,
      cumulativeCost,
      endCost: last.total,
      endP99: last.p99,
      endStatus: last.status,
      endBottleneck: last.bottleneck,
      series: g.points,
      events: g.events,
    };
  });

  // winners
  const runwayVal = (r: number | null) => (r === null ? Infinity : r);

  const costWinner = perDesign.reduce((best, d) =>
    d.cumulativeCost < best.cumulativeCost ? d : best,
  );
  const runwayWinner = perDesign.reduce((best, d) =>
    runwayVal(d.runwayMonths) > runwayVal(best.runwayMonths) ? d : best,
  );
  const latencyWinner = perDesign.reduce((best, d) =>
    d.endP99 < best.endP99 ? d : best,
  );

  return {
    horizonMonths: growth.horizonMonths,
    perDesign,
    winners: {
      cost: costWinner.id,
      runway: runwayWinner.id,
      latency: latencyWinner.id,
    },
  };
}
