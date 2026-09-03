/**
 * Runway — "How it works": an explainer of the model and its calculations.
 *
 * Three parts: (1) the pipeline overview, (2) a LIVE worked example that traces
 * how computeStack turns the current Design inputs into the snapshot — formulas
 * with the real numbers plugged in — and (3) the sourced constants that feed it.
 *
 * All math comes from the model: the worked example is `explainStack()` (whose
 * results are pinned to computeStack), and the constants table is generated from
 * `listConstants()`. The UI restates no model formula and recomputes nothing.
 */
import { useMemo } from "react";
import { explainStack, listConstants, compact } from "../../model/index.ts";
import type { StackInputs } from "../../model/index.ts";

export interface HowItWorksViewProps {
  inputs: StackInputs;
  overrides: Record<string, number>;
}

const PIPELINE: Array<{ step: string; detail: string }> = [
  { step: "Inputs", detail: "load (rps), read/write mix, runtime (lang·proto·vCPU·RAM), datastore, cache, pricing knobs." },
  { step: "Split traffic", detail: "reads vs writes; cache absorbs a share of reads, the rest plus all writes hit the datastore." },
  { step: "Size each tier", detail: "load balancer → API → cache → datastore, each sized to a target-utilization headroom." },
  { step: "Latency", detail: "p50 sums the per-hop contributions; p99 inflates it by how hot the busiest tier runs." },
  { step: "Cost", detail: "nodes × per-node price × provider / reserved / managed multipliers, summed across tiers." },
  { step: "Grow it", detail: "replay the sizing month-by-month along the growth curve to find the first scaling wall (runway)." },
  { step: "Compare & verdict", detail: "run multiple designs over the same curve and pick winners on runway, cost, and latency." },
];

export function HowItWorksView({ inputs, overrides }: HowItWorksViewProps) {
  const explanation = useMemo(() => explainStack(inputs, overrides), [inputs, overrides]);
  const constants = useMemo(() => listConstants(), []);

  return (
    <div className="howitworks">
      {/* INTRO + PIPELINE */}
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">How runway works</h2>
          <p className="panel__sub">
            Every number is a deterministic function of your inputs and a set of
            sourced, editable constants — no hidden state. Here is the whole
            pipeline, then the exact math for your current design.
          </p>
        </div>
        <ol className="hiw__pipeline">
          {PIPELINE.map((p, i) => (
            <li key={p.step} className="hiw__stage">
              <span className="hiw__stagenum">{i + 1}</span>
              <div>
                <b>{p.step}</b>
                <span>{p.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* LIVE WORKED EXAMPLE */}
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Worked example — your current design</h2>
          <p className="panel__sub">
            Reflects your live Design inputs: {compact(inputs.rps)} rps ·{" "}
            {inputs.lang}/{inputs.proto} · {inputs.db} · {inputs.cache} cache ·{" "}
            {inputs.provider.toUpperCase()}
            {Object.keys(overrides).length > 0 ? ` · ${Object.keys(overrides).length} edited constant(s)` : ""}.
            Change anything in <b>Design</b> and this updates.
          </p>
        </div>

        <div className="hiw__sections">
          {explanation.sections.map((sec) => (
            <div key={sec.key} className="hiw__calc">
              <h3 className="hiw__calctitle">{sec.title}</h3>
              <p className="hiw__calcintro">{sec.intro}</p>
              <dl className="hiw__rows">
                {sec.rows.map((row, i) => (
                  <div key={`${sec.key}-${i}`} className="hiw__row">
                    <dt className="hiw__rowlabel">{row.label}</dt>
                    <dd className="hiw__rowformula">{row.formula}</dd>
                    {row.result && <dd className="hiw__rowresult">{row.result}</dd>}
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>

      {/* MODEL NOTES */}
      <section className="panel">
        <div className="panel__head">
          <h2 className="panel__title">Notes on the model</h2>
        </div>
        <ul className="hiw__notes">
          <li>
            <b>Two latency views.</b> <code>p50</code> sums probability-weighted
            per-hop contributions (cache vs DB blended by hit ratio). The request-path
            diagram instead shows the <em>raw</em> per-hop latency a single request
            actually pays on each edge.
          </li>
          <li>
            <b>Single-primary write wall.</b> Postgres, MySQL, Aurora and Oracle pin
            writes to one primary, so beyond <code>write/node ÷ (1 − readFrac)</code>{" "}
            rps you must shard; Cassandra and MongoDB scale writes by adding nodes.
          </li>
          <li>
            <b>Growth &amp; runway.</b> The trajectory replays the same sizing math
            for each month's load; the first tier to break sets the runway. Compare
            runs several designs over one curve and ranks them.
          </li>
          <li>
            <b>Two documented deviations</b> (see source): the “running hot” warn
            threshold is 0.95 (not the prose 0.92) so the worked growth golden
            reproduces, and a runway-tie in the verdict breaks toward lower cost.
          </li>
        </ul>
      </section>

      {/* CONSTANTS & SOURCES */}
      <section className="panel no-print">
        <details>
          <summary className="panel__title panel__title--summary">
            Constants &amp; sources ({constants.length})
          </summary>
          <p className="panel__sub">
            Every value the engine reads, with its unit and citation. These are the
            same constants the Assumptions panel lets you edit in Design.
          </p>
          <div className="hiw__consttable">
            <table>
              <thead>
                <tr>
                  <th>Constant</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {constants.map((c) => (
                  <tr key={c.path}>
                    <td className="hiw__constpath">{c.path}</td>
                    <td className="hiw__constval">{c.value.toLocaleString("en-US")}</td>
                    <td>{c.unit || "—"}</td>
                    <td className="hiw__constsrc">{c.source || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
