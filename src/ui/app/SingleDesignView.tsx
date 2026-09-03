/**
 * Runway — Single-design view: template → tune → trajectory.
 *
 * Owns no persistence (App.tsx lifts state); receives the current StackInputs +
 * growth + overrides and emits changes. Computes the live snapshot, the growth
 * trajectory, the verdict, and the per-cloud deltas, and lays them out.
 */
import { useMemo, useState } from "react";
import {
  computeStack,
  simulateGrowth,
  generateVerdict,
  perCloudDeltas,
  TEMPLATES,
  money,
  compact,
  ms,
  percent,
  formatMonths,
} from "../../model/index.ts";
import type {
  BaseStackInputs,
  GrowthInputs,
  Provider,
  StackInputs,
  TierKey,
} from "../../model/index.ts";
import { StatCard } from "../components/index.ts";
import {
  CostOverTime,
  LatencyOverTime,
  UtilizationOverTime,
} from "../charts/index.ts";
import { StackDiagram } from "./StackDiagram.tsx";
import { TunePanel } from "./TunePanel.tsx";
import { GrowthControls } from "./GrowthControls.tsx";
import { AssumptionsPanel } from "./AssumptionsPanel.tsx";
import { ProviderDeltaBar } from "./ProviderDeltaBar.tsx";
import { EventList } from "./EventList.tsx";
import { VerdictBanner, TierGrid } from "./results.tsx";
import {
  toCostSeries,
  toLatencyPoints,
  toUtilPoints,
  toEventMarkers,
} from "./chartmap.ts";

export interface SingleDesignViewProps {
  inputs: StackInputs;
  growth: GrowthInputs;
  overrides: Record<string, number>;
  onInputs: (next: StackInputs) => void;
  onGrowth: (next: GrowthInputs) => void;
  onOverrideEdit: (path: string, value: number) => void;
  onOverrideReset: (path: string) => void;
}

const RPS_PRESETS = [10_000, 50_000, 100_000, 500_000, 1_000_000];

export function SingleDesignView({
  inputs,
  growth,
  overrides,
  onInputs,
  onGrowth,
  onOverrideEdit,
  onOverrideReset,
}: SingleDesignViewProps) {
  const snapshot = useMemo(
    () => computeStack(inputs, overrides),
    [inputs, overrides],
  );

  // The trajectory uses the live rps as the starting load so the snapshot and
  // month-0 of the trajectory agree.
  const effGrowth: GrowthInputs = { ...growth, startRps: inputs.rps };
  const result = useMemo(() => {
    const { rps: _rps, ...base } = inputs;
    return simulateGrowth(base as BaseStackInputs, effGrowth, overrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, overrides, growth.model, growth.ratePerYear, growth.horizonMonths]);

  const verdict = useMemo(() => generateVerdict(result), [result]);
  const deltas = useMemo(
    () => perCloudDeltas(inputs, "aws", overrides),
    [inputs, overrides],
  );

  const future = result.points[result.points.length - 1];
  const futureSnap = useMemo(
    () => (future ? computeStack({ ...inputs, rps: future.rps }, overrides) : undefined),
    [future, inputs, overrides],
  );

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    onInputs({ ...t.inputs, rps: inputs.rps });
  };

  const setBase = (next: BaseStackInputs) =>
    onInputs({ ...next, rps: inputs.rps });

  const setProvider = (p: Provider) => onInputs({ ...inputs, provider: p });

  const [focusedTier, setFocusedTier] = useState<TierKey | null>(null);

  return (
    <div className="single">
      {/* TEMPLATE PICKER */}
      <section className="panel templates">
        <div className="panel__head">
          <h2 className="panel__title">Start from a reference architecture</h2>
          <p className="panel__sub">Pick a template, then tune anything below.</p>
        </div>
        <div className="templates__grid">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="template"
              onClick={() => applyTemplate(t.id)}
            >
              <span className="template__name">{t.name}</span>
              <span className="template__meta">
                {t.inputs.provider.toUpperCase()} · {t.inputs.lang}/{t.inputs.proto} · {t.inputs.db}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="single__cols">
        {/* TUNE COLUMN */}
        <aside className="panel single__tune">
          <div className="panel__head">
            <h2 className="panel__title">Tune the stack</h2>
          </div>

          {/* RPS dial + presets */}
          <section className="tune__group">
            <h3 className="tune__legend">Load today</h3>
            <div className="rpsdial">
              <input
                type="range"
                className="ag-slider"
                min={0}
                max={1000}
                value={posOf(inputs.rps)}
                onChange={(e) => onInputs({ ...inputs, rps: rpsOf(Number(e.target.value)) })}
                aria-label="Requests per second"
              />
              <div className="rpsdial__readout">
                <b>{compact(inputs.rps)}</b> rps
              </div>
            </div>
            <div className="rpsdial__presets">
              {RPS_PRESETS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={["chip", inputs.rps === r && "chip--on"].filter(Boolean).join(" ")}
                  onClick={() => onInputs({ ...inputs, rps: r })}
                >
                  {compact(r)}
                </button>
              ))}
            </div>
          </section>

          <TunePanel inputs={stripRps(inputs)} onChange={setBase} hideProvider />

          <section className="tune__group">
            <h3 className="tune__legend">Growth curve</h3>
            <GrowthControls growth={growth} onChange={onGrowth} showStart={false} />
          </section>
        </aside>

        {/* RESULTS COLUMN */}
        <div className="single__results">
          <VerdictBanner verdict={verdict} />

          <div className="statrow">
            <StatCard label="Cost now" value={money(snapshot.total)} unit="/mo" accent="cyan" size="lg" />
            <StatCard
              label="Time to wall"
              value={result.runwayMonths === null ? "No wall" : formatMonths(result.runwayMonths)}
              accent={result.runwayMonths === null ? "green" : "amber"}
              sub={result.runwayMonths === null ? `survives ${formatMonths(result.horizonMonths)}` : "until first scaling wall"}
            />
            <StatCard label="p99 now" value={ms(snapshot.p99)} accent="amber" />
            <StatCard
              label="Bottleneck"
              value={snapshot.bottleneck}
              accent="violet"
              sub={`${percent(snapshot.maxUtil)} util`}
            />
            {future && (
              <StatCard
                label={`Cost @ M${future.month}`}
                value={money(future.total)}
                unit="/mo"
                accent="green"
                sub={`~${compact(future.rps)} rps`}
              />
            )}
          </div>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Request path</h2>
              <p className="panel__sub">Live flow through each tier.</p>
            </div>
            <StackDiagram
              now={snapshot}
              future={futureSnap}
              inputs={inputs}
            />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Stack at a glance</h2>
              <p className="panel__sub">Now → horizon (node growth on each tier).</p>
            </div>
            <TierGrid
              now={snapshot}
              future={futureSnap}
              highlight={focusedTier ?? undefined}
              onSelectTier={setFocusedTier}
            />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Trajectory</h2>
              <p className="panel__sub">
                {growth.model} growth, +{percent(growth.ratePerYear)}/yr, {formatMonths(growth.horizonMonths)} horizon.
              </p>
            </div>
            <div className="charts">
              <figure className="chart">
                <figcaption>Cost / month</figcaption>
                <CostOverTime
                  series={toCostSeries(result, "This design")}
                  events={toEventMarkers(result.events)}
                  height={200}
                />
              </figure>
              <figure className="chart">
                <figcaption>Latency (p50 / p99)</figcaption>
                <LatencyOverTime
                  points={toLatencyPoints(result)}
                  events={toEventMarkers(result.events)}
                  height={200}
                />
              </figure>
              <figure className="chart chart--wide">
                <figcaption>Per-tier utilization</figcaption>
                <UtilizationOverTime
                  points={toUtilPoints(result)}
                  height={200}
                  highlight={focusedTier ?? undefined}
                />
              </figure>
            </div>
            <EventList events={result.events} />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Cost across clouds</h2>
              <p className="panel__sub">Same design, every provider. Click to switch.</p>
            </div>
            <ProviderDeltaBar deltas={deltas} selected={inputs.provider} onSelect={setProvider} />
          </section>

          <section className="panel no-print">
            <details>
              <summary className="panel__title panel__title--summary">
                Assumptions &amp; sources ({Object.keys(overrides).length} edited)
              </summary>
              <p className="panel__sub">
                Every constant below feeds the model. Editable rows re-run it live.
              </p>
              <AssumptionsPanel
                overrides={overrides}
                onEdit={onOverrideEdit}
                onReset={onOverrideReset}
              />
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---- rps log-dial helpers (1e3 .. 2e6, 0..1000 positions) ---- */
const RPS_MIN = 1000;
const RPS_MAX = 2_000_000;
function posOf(rps: number): number {
  const lmin = Math.log10(RPS_MIN);
  const lmax = Math.log10(RPS_MAX);
  const lv = Math.log10(Math.max(RPS_MIN, Math.min(RPS_MAX, rps)));
  return ((lv - lmin) / (lmax - lmin)) * 1000;
}
function rpsOf(pos: number): number {
  const lmin = Math.log10(RPS_MIN);
  const lmax = Math.log10(RPS_MAX);
  const v = 10 ** (lmin + (pos / 1000) * (lmax - lmin));
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.round(v / (mag / 10)) * (mag / 10);
}
function stripRps(inputs: StackInputs): BaseStackInputs {
  const { rps: _rps, ...base } = inputs;
  return base;
}
