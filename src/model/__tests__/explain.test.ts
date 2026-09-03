/**
 * Tests for the model explainer (src/model/explain.ts).
 *
 * The explainer must never drift from the engine: its headline RESULTS are
 * pinned to computeStack() for the same inputs. We assert the section structure
 * and that the substituted results echo the authoritative snapshot.
 */
import { describe, expect, it } from "vitest";
import { explainStack } from "../explain.ts";
import { computeStack } from "../stack.ts";
import { sanitizeInputs } from "../sanitize.ts";
import { defaultInputs } from "../presets.ts";
import { money } from "../format.ts";
import type { StackExplanation } from "../explain.ts";

const rowResult = (ex: StackExplanation, sectionKey: string, label: string): string => {
  const sec = ex.sections.find((s) => s.key === sectionKey)!;
  return sec.rows.find((r) => r.label === label)!.result;
};

describe("explainStack", () => {
  it("produces the 7 pipeline sections in order", () => {
    const ex = explainStack(defaultInputs("aws"));
    expect(ex.sections.map((s) => s.key)).toEqual([
      "traffic",
      "lb",
      "api",
      "cache",
      "datastore",
      "latency",
      "cost",
    ]);
  });

  it("headline results are pinned to computeStack (no drift)", () => {
    const inputs = defaultInputs("aws");
    const snap = computeStack(sanitizeInputs(inputs));
    const ex = explainStack(inputs);

    expect(rowResult(ex, "lb", "Nodes")).toBe(`${snap.lb.nodes} nodes`);
    expect(rowResult(ex, "api", "Nodes")).toBe(`${snap.api.nodes} nodes`);
    expect(rowResult(ex, "datastore", "Nodes")).toBe(`${snap.datastore.nodes} nodes`);
    expect(rowResult(ex, "cost", "Total")).toBe(`${money(snap.total)}/mo`);
  });

  it("shows the single-primary write ceiling for a Postgres design", () => {
    const inputs = { ...defaultInputs("aws"), db: "postgres" as const, rps: 1_000_000, readFrac: 0.7 };
    const snap = computeStack(sanitizeInputs(inputs));
    const ex = explainStack(inputs);
    const ds = ex.sections.find((s) => s.key === "datastore")!;
    const wall = ds.rows.find((r) => r.label === "Write ceiling");
    expect(wall).toBeDefined();
    // matches the authoritative snapshot's writeCeiling flag
    expect(wall!.result.includes("shard")).toBe(snap.writeCeiling);
  });

  it("reflects overrides (target_util change moves node counts consistently)", () => {
    const inputs = defaultInputs("aws");
    const ov = { target_util: 0.5 };
    const snap = computeStack(sanitizeInputs(inputs), ov);
    const ex = explainStack(inputs, ov);
    expect(rowResult(ex, "lb", "Nodes")).toBe(`${snap.lb.nodes} nodes`);
    expect(rowResult(ex, "cost", "Total")).toBe(`${money(snap.total)}/mo`);
  });
});
