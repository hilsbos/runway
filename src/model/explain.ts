/**
 * Runway — model explainer. Pure & framework-free.
 *
 * Produces a human-readable, step-by-step trace of how `computeStack()` turns
 * the current inputs into a snapshot: the traffic split, each tier's sizing
 * formula with the live numbers substituted, latency, and the cost roll-up.
 * The "How it works" tab renders this so the UI never restates a model formula
 * itself (per the UI/model boundary in CLAUDE.md).
 *
 * Every headline RESULT is taken from `computeStack()` (the authoritative
 * engine); only the formula illustrations re-state intermediates. explain.test.ts
 * pins the results to `computeStack` so this trace can never silently drift.
 */
import type { StackInputs } from "./types.ts";
import { resolve, DB_KEY } from "./constants.ts";
import { sanitizeInputs, sanitizeOverrides } from "./sanitize.ts";
import { computeStack } from "./stack.ts";
import { compact, money, ms, percent } from "./format.ts";

/** One line of a worked example: a labelled formula and its result. */
export interface ExplainRow {
  /** What this line computes. */
  label: string;
  /** The formula with the live numbers substituted in. */
  formula: string;
  /** The formatted result (authoritative — from computeStack where applicable). */
  result: string;
}

/** A tier/stage of the calculation. */
export interface ExplainSection {
  key: string;
  title: string;
  intro: string;
  rows: ExplainRow[];
}

export interface StackExplanation {
  sections: ExplainSection[];
}

/** Grouped integer / 2-dp number for readable formulas (deterministic). */
function n(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100;
  return r.toLocaleString("en-US");
}

/**
 * Build a step-by-step explanation of how `computeStack(inputs, overrides)`
 * produces its snapshot, with the live inputs substituted into each formula.
 */
export function explainStack(
  inputs: StackInputs,
  overrides?: Record<string, number>,
): StackExplanation {
  // Mirror computeStack: it sanitizes inputs/overrides before computing.
  const s = sanitizeInputs(inputs);
  const ov = overrides ? sanitizeOverrides(overrides) : undefined;
  const g = resolve(ov);
  const snap = computeStack(s, ov); // authoritative results

  const tu = g("target_util");
  const reads = s.rps * s.readFrac;
  const writes = s.rps * (1 - s.readFrac);
  const localPenalty = g("local_hit_penalty");
  let h = s.cache === "none" ? 0 : s.hitRatio;
  if (s.cache === "local") h *= localPenalty;
  const dbReads = reads * (1 - h);
  const cacheGets = reads * h;

  // pricing multipliers (mirror stack.ts)
  const compute = g(`PRICE.${s.provider}.compute`);
  const storage = g(`PRICE.${s.provider}.storage`);
  const reservedMult = s.reserved ? g(`PRICE.${s.provider}.reserved`) : 1;
  const managedMult = s.managed ? g("managed_mult") : 1;
  const rmult = reservedMult * compute;
  const dmult = managedMult * reservedMult * storage;

  // api / datastore intermediates
  const perCore = g(`core_${s.lang}_${s.proto}`);
  const apiT = perCore * s.cores;
  const dbk = DB_KEY[s.db];
  const dbRead = g(`${dbk}.read`);
  const dbWrite = g(`${dbk}.write`);
  const dbRf = g(`${dbk}.rf`);
  const writeScales = dbk === "cass" || dbk === "mongo";

  const sections: ExplainSection[] = [];

  // 1 — traffic
  const hitRow: ExplainRow =
    s.cache === "none"
      ? { label: "Cache hit ratio", formula: "no cache → every read hits the datastore", result: "0%" }
      : s.cache === "local"
        ? { label: "Effective hit ratio", formula: `${percent(s.hitRatio)} × ${n(localPenalty)} local-cache penalty`, result: percent(h) }
        : { label: "Cache hit ratio", formula: `${percent(s.hitRatio)} (distributed)`, result: percent(h) };
  sections.push({
    key: "traffic",
    title: "1 · Split the traffic",
    intro: `${compact(s.rps)} rps today at a ${percent(s.readFrac)} read mix. Cache can absorb reads; writes always hit the datastore.`,
    rows: [
      { label: "Reads", formula: `${n(s.rps)} × ${percent(s.readFrac)}`, result: `${compact(reads)} rps` },
      { label: "Writes", formula: `${n(s.rps)} × (1 − ${percent(s.readFrac)})`, result: `${compact(writes)} rps` },
      hitRow,
      { label: "DB reads (misses)", formula: `${compact(reads)} reads × (1 − ${percent(h)})`, result: `${compact(dbReads)} rps` },
    ],
  });

  // 2 — load balancer
  sections.push({
    key: "lb",
    title: "2 · Load balancer",
    intro: `Sized to the ${percent(tu)} target-utilization headroom, with a 2-node HA floor.`,
    rows: [
      { label: "Nodes", formula: `max(2, ⌈${n(s.rps)} ÷ (${n(g("haproxy_tput"))} × ${n(tu)})⌉)`, result: `${snap.lb.nodes} nodes` },
      { label: "Utilization", formula: `${n(s.rps)} ÷ (${snap.lb.nodes} × ${n(g("haproxy_tput"))})`, result: percent(snap.lb.util) },
      { label: "Cost", formula: `${snap.lb.nodes} × ${money(g("haproxy_cost"))} × ${n(rmult)} pricing`, result: `${money(snap.lb.cost)}/mo` },
    ],
  });

  // 3 — API
  sections.push({
    key: "api",
    title: "3 · API tier",
    intro: `Per-node throughput scales with vCPU: ${s.lang}/${s.proto} sustains ${n(perCore)} rps per vCPU.`,
    rows: [
      { label: "Per-node throughput", formula: `${n(perCore)} rps/vCPU × ${s.cores} vCPU`, result: `${compact(apiT)} rps/node` },
      { label: "Nodes", formula: `⌈${n(s.rps)} ÷ (${compact(apiT)} × ${n(tu)})⌉`, result: `${snap.api.nodes} nodes` },
      { label: "RAM per node", formula: `${percent(snap.memUtil)} of ${s.ramGB} GB used (Little's-law concurrency)`, result: snap.memOver ? "over capacity" : "within RAM" },
      { label: "Cost", formula: `${snap.api.nodes} × (${s.cores}×${money(g("api_cost_vcpu"))} + ${s.ramGB}×${money(g("api_cost_gb"))}) × ${n(rmult)}`, result: `${money(snap.api.cost)}/mo` },
    ],
  });

  // 4 — cache
  if (s.cache === "distributed") {
    const ops = cacheGets + writes;
    sections.push({
      key: "cache",
      title: "4 · Distributed cache",
      intro: "A shared Redis-class tier serving cache GETs plus write-through SET/invalidate.",
      rows: [
        { label: "Cache ops", formula: `${compact(cacheGets)} GETs + ${compact(writes)} writes`, result: `${compact(ops)} ops/s` },
        { label: "Nodes", formula: `max(${n(g("redis_rf"))} rf, ⌈${compact(ops)} ÷ (${n(g("redis_tput"))} × ${n(tu)})⌉)`, result: `${snap.cache.nodes} nodes` },
        { label: "Cost", formula: `${snap.cache.nodes} × ${money(g("redis_cost"))} × ${n(dmult)}`, result: `${money(snap.cache.cost)}/mo` },
      ],
    });
  } else {
    sections.push({
      key: "cache",
      title: "4 · Cache",
      intro:
        s.cache === "local"
          ? "Local in-process cache — no separate nodes; it lives inside each API node's RAM."
          : "No cache — every read hits the datastore.",
      rows: [{ label: "Nodes", formula: s.cache === "local" ? "in-process (counted in API RAM)" : "none", result: "0 nodes" }],
    });
  }

  // 5 — datastore
  const datastoreRows: ExplainRow[] = [
    { label: "Read nodes", formula: `⌈${compact(dbReads)} ÷ (${n(dbRead)} × ${n(tu)})⌉`, result: `${Math.ceil(dbReads / (dbRead * tu))}` },
    { label: "Write nodes", formula: writeScales ? `⌈${compact(writes)} ÷ (${n(dbWrite)} × ${n(tu)})⌉` : "1 (single primary)", result: writeScales ? `${Math.ceil(writes / (dbWrite * tu))}` : "1" },
    { label: "Nodes", formula: `max(${n(dbRf)} rf, read nodes, write nodes)`, result: `${snap.datastore.nodes} nodes` },
  ];
  if (!writeScales) {
    datastoreRows.push({
      label: "Write ceiling",
      formula: `${compact(writes)} writes vs ${n(dbWrite)}/s on one primary`,
      result: snap.writeCeiling ? "exceeded — must shard" : "within one primary",
    });
  }
  datastoreRows.push({ label: "Cost", formula: `${snap.datastore.nodes} × ${money(g(`${dbk}.cost`))} × ${n(dmult)}`, result: `${money(snap.datastore.cost)}/mo` });
  sections.push({
    key: "datastore",
    title: "5 · Datastore",
    intro: writeScales
      ? "Reads scale via replicas and writes scale out across nodes — no single-primary wall."
      : "Reads scale via replicas, but writes are pinned to a single primary — the write ceiling.",
    rows: datastoreRows,
  });

  // 6 — latency
  sections.push({
    key: "latency",
    title: "6 · Latency",
    intro: "p50 sums the per-hop latency contributions (weighted by cache hit ratio); p99 inflates p50 by how hot the busiest tier runs.",
    rows: [
      { label: "p50", formula: `${n(snap.latParts.lb)} lb + ${n(snap.latParts.api)} api + ${n(snap.latParts.cacheHit)} cache + ${n(snap.latParts.db)} db`, result: ms(snap.p50) },
      { label: "p99", formula: `${ms(snap.p50)} × (2.4 + ${percent(snap.maxUtil)} × 4.5)`, result: ms(snap.p99) },
      { label: "Real per-hop", formula: `a single request pays cache-hit ${ms(snap.latHops.cacheHit)} OR db-read ${ms(snap.latHops.db)} (not the blended p50 contribution)`, result: "" },
    ],
  });

  // 7 — cost roll-up
  const costRows: ExplainRow[] = [
    { label: "LB + API", formula: `${money(snap.costs.lb)} + ${money(snap.costs.api)}`, result: `${money(snap.costs.lb + snap.costs.api)}/mo` },
    { label: "Cache + datastore", formula: `${money(snap.costs.cache)} + ${money(snap.costs.datastore)}`, result: `${money(snap.costs.cache + snap.costs.datastore)}/mo` },
  ];
  if (snap.costs.egress > 0) {
    costRows.push({ label: "Egress", formula: "internet egress on read payloads", result: `${money(snap.costs.egress)}/mo` });
  }
  costRows.push({ label: "Total", formula: "sum of every tier", result: `${money(snap.total)}/mo` });
  sections.push({
    key: "cost",
    title: "7 · Monthly cost",
    intro: `Sum every tier. Pricing knobs: ${s.provider.toUpperCase()}, reserved ${s.reserved ? "on" : "off"}, managed ${s.managed ? "on" : "off"}.`,
    rows: costRows,
  });

  return { sections };
}
