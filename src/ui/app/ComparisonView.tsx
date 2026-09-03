/**
 * Runway — Comparison view: 2–3 tuned designs over a shared growth horizon.
 *
 * Each slot keeps its own BaseStackInputs (preserved while switching tabs).
 * Overlaid cost & latency charts, a per-design tier column, a delta table
 * (runway / cumCost / endP99 / endStatus / per-cloud), and a winner-aware
 * verdict banner from generateCompareVerdict.
 */
import { useMemo, useState } from "react";
import {
  compareDesigns,
  simulateGrowth,
  computeStack,
  generateCompareVerdict,
  perCloudDeltas,
  TEMPLATES,
  money,
  ms,
  compact,
  formatMonths,
} from "../../model/index.ts";
import type {
  BaseStackInputs,
  GrowthInputs,
  NamedDesign,
} from "../../model/index.ts";
import { ComparisonChart } from "../charts/index.ts";
import { TunePanel } from "./TunePanel.tsx";
import { GrowthControls } from "./GrowthControls.tsx";
import { VerdictBanner, TierGrid } from "./results.tsx";
import { toComparisonSeries } from "./chartmap.ts";
import type { CompareSlot } from "./share.ts";

export interface ComparisonViewProps {
  slots: CompareSlot[];
  growth: GrowthInputs;
  overrides: Record<string, number>;
  onSlots: (next: CompareSlot[]) => void;
  onGrowth: (next: GrowthInputs) => void;
}

const SLOT_NAMES = ["A", "B", "C"];

export function ComparisonView({
  slots,
  growth,
  overrides,
  onSlots,
  onGrowth,
}: ComparisonViewProps) {
  const [active, setActive] = useState(0);

  const designs: NamedDesign[] = slots.map((s) => ({
    id: s.id,
    name: s.name,
    inputs: s.inputs,
  }));

  const compare = useMemo(
    () => compareDesigns(designs, growth, overrides),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(slots), growth, overrides],
  );
  const verdict = useMemo(() => generateCompareVerdict(compare), [compare]);

  const costSeries = useMemo(
    () =>
      slots.map((s) =>
        toComparisonSeries(
          simulateGrowth(s.inputs, growth, overrides),
          s.id,
          s.name,
          "total",
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(slots), growth, overrides],
  );
  const latSeries = useMemo(
    () =>
      slots.map((s) =>
        toComparisonSeries(
          simulateGrowth(s.inputs, growth, overrides),
          s.id,
          s.name,
          "p99",
        ),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(slots), growth, overrides],
  );

  const updateSlot = (idx: number, inputs: BaseStackInputs) => {
    const next = slots.slice();
    next[idx] = { ...next[idx]!, inputs };
    onSlots(next);
  };
  const renameSlot = (idx: number, name: string) => {
    const next = slots.slice();
    next[idx] = { ...next[idx]!, name };
    onSlots(next);
  };
  const addSlot = () => {
    if (slots.length >= 3) return;
    const tmpl = TEMPLATES[slots.length % TEMPLATES.length]!;
    onSlots([
      ...slots,
      {
        id: `slot-${Date.now()}`,
        name: `Design ${SLOT_NAMES[slots.length] ?? slots.length + 1}`,
        inputs: { ...tmpl.inputs },
      },
    ]);
    setActive(slots.length);
  };
  const removeSlot = (idx: number) => {
    if (slots.length <= 2) return;
    onSlots(slots.filter((_, i) => i !== idx));
    setActive(Math.max(0, idx - 1));
  };
  const applyTemplate = (idx: number, id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (t) updateSlot(idx, { ...t.inputs });
  };

  const winners = compare.winners;
  const activeSlot = slots[active]!;

  return (
    <div className="compare">
      <VerdictBanner verdict={verdict} />

      {/* slot tabs + per-design tune */}
      <div className="compare__cols">
        <aside className="panel compare__tune">
          <div className="compare__slots">
            {slots.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={["slottab", i === active && "slottab--on"].filter(Boolean).join(" ")}
                onClick={() => setActive(i)}
              >
                {s.name}
              </button>
            ))}
            {slots.length < 3 && (
              <button type="button" className="slottab slottab--add" onClick={addSlot}>
                + add
              </button>
            )}
          </div>

          <div className="compare__slotedit">
            <div className="compare__slotrow">
              <input
                className="scenbar__input"
                value={activeSlot.name}
                onChange={(e) => renameSlot(active, e.target.value)}
                aria-label="Design name"
              />
              {slots.length > 2 && (
                <button type="button" className="btn btn--danger" onClick={() => removeSlot(active)}>
                  Remove
                </button>
              )}
            </div>
            <label className="compare__tmpl">
              <span>Load template</span>
              <select
                className="scenbar__select"
                value=""
                onChange={(e) => e.target.value && applyTemplate(active, e.target.value)}
              >
                <option value="">choose…</option>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <TunePanel inputs={activeSlot.inputs} onChange={(n) => updateSlot(active, n)} />
          </div>

          <section className="tune__group">
            <h3 className="tune__legend">Shared growth curve</h3>
            <GrowthControls growth={growth} onChange={onGrowth} />
          </section>
        </aside>

        <div className="compare__results">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Cost over time</h2>
            </div>
            <ComparisonChart series={costSeries} metric="cost" height={220} />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">p99 latency over time</h2>
            </div>
            <ComparisonChart series={latSeries} metric="latency" height={220} />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Head-to-head</h2>
            </div>
            <div className="difftable">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    {compare.perDesign.map((d) => (
                      <th key={d.id}>{d.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Runway</td>
                    {compare.perDesign.map((d) => (
                      <td key={d.id} data-win={d.id === winners.runway}>
                        {d.runwayMonths === null ? "survives" : formatMonths(d.runwayMonths)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Cumulative cost</td>
                    {compare.perDesign.map((d) => (
                      <td key={d.id} data-win={d.id === winners.cost}>
                        {money(d.cumulativeCost)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Cost @ end</td>
                    {compare.perDesign.map((d) => (
                      <td key={d.id}>{money(d.endCost)}/mo</td>
                    ))}
                  </tr>
                  <tr>
                    <td>p99 @ end</td>
                    {compare.perDesign.map((d) => (
                      <td key={d.id} data-win={d.id === winners.latency}>
                        {ms(d.endP99)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>End status</td>
                    {compare.perDesign.map((d) => (
                      <td key={d.id}>
                        <span className="pill" data-status={d.endStatus}>
                          {d.endStatus}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>End bottleneck</td>
                    {compare.perDesign.map((d) => (
                      <td key={d.id}>{d.endBottleneck}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>AWS cost now</td>
                    {slots.map((s) => {
                      const dd = perCloudDeltas({ ...s.inputs, rps: growth.startRps }, "aws", overrides);
                      return <td key={s.id}>{money(dd.aws.total)}/mo</td>;
                    })}
                  </tr>
                  <tr>
                    <td>Cheapest cloud now</td>
                    {slots.map((s) => {
                      const dd = perCloudDeltas({ ...s.inputs, rps: growth.startRps }, "aws", overrides);
                      const best = (["aws", "gcp", "azure", "onprem"] as const).reduce((a, b) =>
                        dd[b].total < dd[a].total ? b : a,
                      );
                      return (
                        <td key={s.id}>
                          {best.toUpperCase()} {money(dd[best].total)}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Stacks at the start ({compact(growth.startRps)} rps)</h2>
            </div>
            <div className="compare__tiers">
              {slots.map((s) => (
                <div key={s.id} className="compare__tiercol">
                  <h3 className="compare__tiername">{s.name}</h3>
                  <TierGrid now={computeStack({ ...s.inputs, rps: growth.startRps }, overrides)} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
