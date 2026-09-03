/**
 * Runway — Datastores view: head-to-head scaling lens for the three engines.
 *
 * Shows HOW Postgres / Cassandra / MongoDB scale node count + cost as load
 * grows, and WHERE clustering them hits a wall. The lens (load, read/write
 * mix, provider, managed) is LOCAL React state — it is NOT persisted to
 * AppState or the share URL (only the tab `mode` persists). All numbers come
 * from the model (`datastoreScaling` / `datastoreFacts`); the UI never recomputes
 * node math.
 *
 * The story: Postgres pins writes to a single primary, so past a write wall it
 * cannot add write capacity by adding nodes — you must shard. Cassandra and
 * MongoDB scale writes horizontally (Cassandra needs fewer nodes thanks to its
 * higher write throughput per node).
 */
import { useMemo, useState } from "react";
import {
  datastoreScaling,
  datastoreFacts,
  money,
  compact,
  ms,
  percent,
} from "../../model/index.ts";
import type { Provider, Db } from "../../model/index.ts";
import type { SliderAccent } from "../components/Slider.tsx";
import {
  Slider,
  Segmented,
  Toggle,
  Banner,
  StatCard,
  TierCard,
} from "../components/index.ts";
import { DatastoreScaleChart, dbColor } from "../charts/index.ts";
import { toDbScaleSeries } from "./chartmap.ts";

const PROVIDER_OPTIONS: Array<{ value: Provider; label: string }> = [
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
  { value: "azure", label: "Azure" },
  { value: "onprem", label: "On-prem" },
];

/** Per-engine accent, matched to the chart's DB_COLORS hue. */
const DB_ACCENT: Record<Db, SliderAccent> = {
  postgres: "cyan",
  mysql: "blue",
  aurora: "amber",
  oracledb: "pink",
  cassandra: "green",
  mongodb: "violet",
};

/** rps axis tick: 200000 -> "200k", 1.2e6 -> "1.2M". */
function rpsTick(v: number): string {
  return compact(v);
}

export function DatastoresView() {
  // ---- local lens state (not persisted) ----
  const [maxRps, setMaxRps] = useState(200_000);
  const [readFrac, setReadFrac] = useState(0.9);
  const [provider, setProvider] = useState<Provider>("aws");
  const [managed, setManaged] = useState(false);

  const curves = useMemo(
    () =>
      datastoreScaling({
        maxRps,
        readFrac,
        provider,
        managed,
      }),
    [maxRps, readFrac, provider, managed],
  );

  const facts = useMemo(
    () => datastoreFacts({ readFrac, provider, managed }),
    [readFrac, provider, managed],
  );

  const nodeSeries = useMemo(() => toDbScaleSeries(curves, "nodes"), [curves]);
  const costSeries = useMemo(() => toDbScaleSeries(curves, "cost"), [curves]);

  const singlePrimary = facts.filter((f) => !f.writeScales);
  const scaleOut = facts.filter((f) => f.writeScales);
  // The lowest write/node engine hits its wall first as load grows.
  const firstWall = singlePrimary.reduce<number | null>((min, f) => {
    const w = f.writeCeilingRps;
    if (w == null) return min;
    return min == null || w < min ? w : min;
  }, null);
  const wallVisible = firstWall != null && firstWall <= maxRps;

  return (
    <div className="datastores">
      <Banner
        variant={wallVisible ? "warn" : "info"}
        title="Clustering limits"
      >
        <strong>Single-primary engines</strong> —{" "}
        {singlePrimary.map((f) => f.label).join(", ")} — serve reads from
        replicas but pin <em>writes to one primary/writer</em>. Each hits a write
        wall at a {percent(readFrac)} read mix (
        {singlePrimary
          .map((f) => `${f.label} ~${compact(f.writeCeilingRps ?? 0)}`)
          .join(", ")}{" "}
        rps); past it, adding nodes buys <em>no</em> write capacity and you must{" "}
        <b>shard</b>.{" "}
        <strong>{scaleOut.map((f) => f.label).join(" & ")}</strong> scale writes{" "}
        <em>horizontally</em> — node count grows smoothly with load (
        {scaleOut
          .map((f) => `${f.label} ${compact(f.writePerNode)} writes/node`)
          .join(", ")}
        ).
      </Banner>

      <div className="datastores__cols">
        {/* ---- lens controls ---- */}
        <aside className="panel datastores__tune">
          <div className="panel__head">
            <h2 className="panel__title">Lens</h2>
            <p className="panel__sub">
              Compare the engines head-to-head. Not saved to your scenario.
            </p>
          </div>

          <Slider
            label="Peak load"
            value={maxRps}
            onChange={setMaxRps}
            min={10_000}
            max={2_000_000}
            log
            unit="rps"
            format={(v) => compact(v)}
            hint="Sweeps from a low floor up to this peak."
            accent="cyan"
            aria-label="Peak load in requests per second"
          />

          <Slider
            label="Read mix"
            value={readFrac}
            onChange={setReadFrac}
            min={0.5}
            max={1}
            step={0.01}
            unit="reads"
            format={(v) => percent(v)}
            hint="Share of requests that are reads (rest are writes)."
            accent="green"
            aria-label="Read fraction of the load"
          />

          <div className="datastores__field">
            <span className="datastores__fieldlabel">Provider</span>
            <Segmented
              options={PROVIDER_OPTIONS}
              value={provider}
              onChange={setProvider}
              block
              aria-label="Cloud provider"
            />
          </div>

          <div className="datastores__field">
            <Toggle
              checked={managed}
              onChange={setManaged}
              label="Managed service"
              accent="violet"
              aria-label="Managed datastore service"
            />
          </div>
        </aside>

        {/* ---- results ---- */}
        <div className="datastores__results">
          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Nodes required vs load</h2>
              <p className="panel__sub">
                Cluster size to serve the load at target utilization. The red
                wall marks where Postgres writes outgrow a single primary; its
                line goes dashed/red past the wall to show added nodes buy no
                write headroom.
              </p>
            </div>
            <DatastoreScaleChart
              series={nodeSeries}
              valueFormatter={(v) => String(Math.round(v))}
              rpsFormatter={rpsTick}
              unitSuffix=" nodes"
              height={260}
              yAxisWidth={40}
              ariaLabel="Nodes required for each datastore as load grows"
            />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Cost at scale ($/mo vs load)</h2>
              <p className="panel__sub">
                Monthly cluster cost as load grows ({provider.toUpperCase()}
                {managed ? ", managed" : ""}).
              </p>
            </div>
            <DatastoreScaleChart
              series={costSeries}
              valueFormatter={(v) => money(v)}
              rpsFormatter={rpsTick}
              unitSuffix="/mo"
              height={260}
              yAxisWidth={56}
              ariaLabel="Monthly cost for each datastore as load grows"
            />
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">Engine facts</h2>
              <p className="panel__sub">
                Per-node throughput, cost, clustering, and consistency model.
              </p>
            </div>

            <Banner variant="info" title="Consistency: ACID / BASE & CAP">
              <p className="datastores__cap-line">
                The <strong>CAP theorem</strong> (Brewer): under a network
                partition a distributed store can keep at most two of{" "}
                <em>Consistency</em>, <em>Availability</em>, and{" "}
                <em>Partition-tolerance</em> — so real stores choose{" "}
                <span className="datastores__cap-badge datastores__cap-badge--cp">
                  CP
                </span>{" "}
                (consistency over availability) or{" "}
                <span className="datastores__cap-badge datastores__cap-badge--ap">
                  AP
                </span>{" "}
                (availability over consistency).
              </p>
              <p className="datastores__cap-line">
                <span className="datastores__model-badge datastores__model-badge--acid">
                  ACID
                </span>{" "}
                — strong, transactional guarantees (the single-primary
                relational engines). {" "}
                <span className="datastores__model-badge datastores__model-badge--base">
                  BASE
                </span>{" "}
                — Basically-Available, Soft-state, Eventually-consistent (the
                scale-out NoSQL stores).
              </p>
            </Banner>

            <div className="tiergrid">
              {facts.map((f) => {
                const accent = DB_ACCENT[f.db];
                return (
                  <TierCard
                    key={f.db}
                    name={f.label}
                    accent={accent}
                    bad={!f.writeScales}
                    specs={[
                      { label: "reads/node", value: compact(f.readPerNode) },
                      { label: "writes/node", value: compact(f.writePerNode) },
                      { label: "$/node", value: money(f.costPerNode) },
                      { label: "rf", value: f.rf },
                      { label: "read lat", value: ms(f.readLatencyMs) },
                    ]}
                  >
                    <div
                      className="datastores__traits"
                      aria-label={`${f.consistency}, ${f.cap}`}
                    >
                      <span
                        className={`datastores__model-badge datastores__model-badge--${f.consistency.toLowerCase()}`}
                      >
                        {f.consistency}
                      </span>
                      <span
                        className={`datastores__cap-badge datastores__cap-badge--${f.cap.toLowerCase()}`}
                      >
                        {f.cap}
                      </span>
                    </div>
                    <p className="datastores__capnote">{f.capNote}</p>

                    <p className="datastores__write">
                      {f.writeScales ? (
                        <>
                          <span className="datastores__write-ok">
                            writes: scale-out
                          </span>{" "}
                          — add nodes to add write capacity.
                        </>
                      ) : (
                        <>
                          <span className="datastores__write-wall">
                            writes: single-primary wall
                          </span>{" "}
                          {f.writeCeilingRps != null && (
                            <>@ {compact(f.writeCeilingRps)} rps</>
                          )}{" "}
                          — must shard to grow writes.
                        </>
                      )}
                    </p>
                  </TierCard>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2 className="panel__title">
                At peak ({compact(maxRps)} rps)
              </h2>
            </div>
            <div className="statrow">
              {curves.map((c) => {
                const end = c.points[c.points.length - 1];
                if (!end) return null;
                const accent = DB_ACCENT[c.db];
                return (
                  <StatCard
                    key={c.db}
                    label={c.label}
                    value={end.nodes}
                    unit="nodes"
                    accent={accent}
                    sub={
                      <span style={{ color: dbColor(c.db) }}>
                        {money(end.cost)}/mo ·{" "}
                        {end.writeCeiling ? "write wall" : `${percent(end.util)} util`}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
