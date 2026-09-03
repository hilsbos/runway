/**
 * Runway — deterministic plain-English verdict generator. Derives strictly
 * from model outputs; honest and qualified (no overclaiming). See MODEL-SPEC
 * §5.3. Pure & deterministic (no wall-clock).
 */
import type {
  CompareResult,
  GrowthResult,
  TierKey,
  Verdict,
} from "./types.ts";
import { money, compact } from "./format.ts";

/* cheapest lever keyed by the bottleneck tier */
const LEVER: Record<TierKey, string> = {
  datastore: "switch to a write-scaling datastore (Cassandra/Mongo) or shard the primary",
  authz: "enable token-verify caching (vcache) to cut per-call verification",
  api: "add API cores per node (or more API nodes)",
  cache: "move to a distributed cache to raise the hit-served fraction",
  lb: "add load-balancer nodes",
};

/* -------------------------------------------------------------------------- */
/* single design                                                              */
/* -------------------------------------------------------------------------- */

export function generateVerdict(g: GrowthResult): Verdict {
  const first = g.points[0];
  const last = g.points[g.points.length - 1];
  if (!first || !last) {
    return { tone: "warn", headline: "No data", detail: "Growth produced no points." };
  }
  const H = g.horizonMonths;

  if (first.status === "bad") {
    return {
      tone: "bad",
      headline: "Underprovisioned today",
      detail: `${snapMessage(g)} Fix before projecting growth. Cheapest lever: ${LEVER[first.bottleneck]}.`,
    };
  }

  const healthy =
    g.runwayMonths === null || g.runwayMonths >= H;
  if (healthy) {
    return {
      tone: "good",
      headline: `Healthy through the ${H}-month horizon`,
      detail: `Stays within target utilization to ~${compact(last.rps)} rps at ~${money(last.total)}/mo. No wall in view. Watch tier: ${last.bottleneck}.`,
    };
  }

  // warn: hits a wall before the horizon
  const runway = g.runwayMonths as number;
  const wall = g.points.find((p) => p.month === runway);
  const tier = wall ? wall.bottleneck : last.bottleneck;
  const rpsAtWall = wall ? wall.rps : last.rps;
  const breaking = g.events.find((e) => e.kind === "breaking");
  const msg = breaking ? breaking.message : snapMessage(g);
  return {
    tone: "warn",
    headline: `Hits a ${tier} wall at month ${runway}`,
    detail: `At ~${compact(rpsAtWall)} rps: ${msg} Buys ~${runway} months of runway. Cheapest lever: ${LEVER[tier]}.`,
  };
}

function snapMessage(g: GrowthResult): string {
  const first = g.points[0];
  // first point doesn't carry a message; reconstruct from status/bottleneck.
  if (first && first.status === "bad") {
    return `${first.bottleneck} is over capacity at the starting load.`;
  }
  const breaking = g.events.find((e) => e.kind === "breaking");
  return breaking ? breaking.message : "A tier exceeds capacity.";
}

/* -------------------------------------------------------------------------- */
/* comparison                                                                 */
/* -------------------------------------------------------------------------- */

export function generateCompareVerdict(c: CompareResult): Verdict {
  const designs = c.perDesign;
  if (designs.length === 0) {
    return { tone: "warn", headline: "No designs", detail: "Nothing to compare." };
  }
  if (designs.length === 1) {
    const only = designs[0]!;
    return {
      tone: "good",
      headline: `${only.name} (only candidate)`,
      detail: `Runway ${only.runwayMonths === null ? `through the ${c.horizonMonths}-month horizon` : `month ${only.runwayMonths}`} at ~${money(only.cumulativeCost)} cumulative.`,
    };
  }

  const runwayVal = (r: number | null) => (r === null ? Infinity : r);

  // rank: 1) longest runway 2) lowest cumulativeCost (within ±2mo tier) 3) lowest endP99
  const ranked = [...designs].sort((a, b) => {
    const ra = runwayVal(a.runwayMonths);
    const rb = runwayVal(b.runwayMonths);
    // "same runway tier" = identical runway (including BOTH surviving the
    // horizon, where ra === rb === Infinity) or within 2 months. Guard against
    // Math.abs(Infinity - Infinity) === NaN, which made the comparator return
    // NaN and left the winner as whatever slot happened to be first — so two
    // healthy designs would "recommend" the costlier one. (See regression test.)
    const sameTier =
      ra === rb ||
      (Number.isFinite(ra) && Number.isFinite(rb) && Math.abs(ra - rb) <= 2);
    if (!sameTier) return rb - ra; // longer runway first
    if (a.cumulativeCost !== b.cumulativeCost) {
      return a.cumulativeCost - b.cumulativeCost; // cheaper first
    }
    return a.endP99 - b.endP99;
  });

  const winner = ranked[0]!;
  // pick the most relevant loser to contrast against: the next-ranked design.
  const loser = ranked[1]!;

  const clauses: string[] = [];

  // runway clause
  const wRun = runwayVal(winner.runwayMonths);
  const lRun = runwayVal(loser.runwayMonths);
  if (wRun > lRun) {
    const winnerPart =
      winner.runwayMonths === null
        ? `stays healthy through the ${c.horizonMonths}-month horizon`
        : `lasts to month ${winner.runwayMonths}`;
    const loserPart =
      loser.runwayMonths === null
        ? `${loser.name} also survives`
        : `${loser.name}'s month ${loser.runwayMonths}`;
    clauses.push(`${winnerPart} vs ${loserPart}`);
  }

  // cost clause (only if |pct| >= 3%)
  const costPct =
    loser.cumulativeCost === 0
      ? 0
      : (winner.cumulativeCost - loser.cumulativeCost) / loser.cumulativeCost;
  const absPct = Math.abs(costPct);
  if (absPct >= 0.03) {
    if (costPct < 0) {
      clauses.push(`costs ~${Math.round(absPct * 100)}% less`);
    } else {
      // honesty guard: costlier but lasts longer
      if (wRun > lRun) {
        const moreMonths =
          wRun === Infinity
            ? `survives the horizon`
            : `${wRun - lRun} more months`;
        clauses.push(`costs ~${Math.round(absPct * 100)}% more but buys ${moreMonths}`);
      } else {
        clauses.push(`costs ~${Math.round(absPct * 100)}% more`);
      }
    }
  } else {
    clauses.push("at comparable cost");
  }

  // latency clause (only if >= 5% and winner not worse elsewhere)
  const latPct =
    loser.endP99 === 0 ? 0 : (loser.endP99 - winner.endP99) / loser.endP99;
  if (latPct >= 0.05 && winner.endCost <= loser.endCost * 1.0001) {
    clauses.push(`with ~${Math.round(latPct * 100)}% lower p99`);
  }

  const tone: Verdict["tone"] =
    winner.endStatus === "bad" ? "warn" : "good";

  return {
    tone,
    headline: `${winner.name} is recommended`,
    detail: clauses.join(", ") + ".",
  };
}
