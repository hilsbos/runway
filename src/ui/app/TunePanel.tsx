/**
 * Runway — TUNE panel.
 *
 * All stack-design controls for a single design: provider, traffic mix, runtime,
 * datastore, cache, node spec, and pricing toggles. Edits a `BaseStackInputs`
 * (no rps); the single-design view layers the rps dial on top via `<RpsDial>`.
 */
import {
  Field,
  Segmented,
  Slider,
  Toggle,
} from "../components/index.ts";
import type { SegmentedOption } from "../components/index.ts";
import type {
  BaseStackInputs,
  Cache,
  Db,
  Lang,
  Proto,
  Provider,
} from "../../model/index.ts";
import { percent } from "../../model/index.ts";

const PROVIDERS: SegmentedOption<Provider>[] = [
  { value: "aws", label: "AWS" },
  { value: "gcp", label: "GCP" },
  { value: "azure", label: "Azure" },
  { value: "onprem", label: "On-prem" },
];
const LANGS: SegmentedOption<Lang>[] = [
  { value: "rust", label: "Rust" },
  { value: "java", label: "Java" },
];
const PROTOS: SegmentedOption<Proto>[] = [
  { value: "rest", label: "REST" },
  { value: "grpc", label: "gRPC" },
];
const DBS: SegmentedOption<Db>[] = [
  { value: "postgres", label: "Postgres" },
  { value: "mysql", label: "MySQL" },
  { value: "aurora", label: "Aurora" },
  { value: "oracledb", label: "Oracle" },
  { value: "cassandra", label: "Cassandra" },
  { value: "mongodb", label: "MongoDB" },
];
const CACHES: SegmentedOption<Cache>[] = [
  { value: "none", label: "None", title: "No cache — every read hits the datastore" },
  { value: "local", label: "Local", title: "In-process cache inside each API node (in-memory, e.g. Caffeine)" },
  { value: "distributed", label: "Distributed", title: "Shared Redis-class cache tier all API nodes read from" },
];

/** Plain-language explanation of each cache option, shown under the control. */
const CACHE_HINT: Record<Cache, string> = {
  none: "No cache — every read goes to the datastore, which carries the full read load.",
  local: "In-process cache in each API node (in-memory, e.g. Caffeine). Fastest hit (~0.2 ms) and no extra servers — but each node has its own copy, so only ~85% of the hit rate counts and it adds ~2 GB RAM per node.",
  distributed: "Shared Redis-class tier every API node reads from (~0.8 ms hit). One shared copy, so the full hit rate counts — at the cost of extra nodes (~$320/mo each, ×2 for HA).",
};
export interface TunePanelProps {
  inputs: BaseStackInputs;
  onChange: (next: BaseStackInputs) => void;
  /** Hide the provider selector (the single view places it in the header). */
  hideProvider?: boolean;
}

export function TunePanel({
  inputs,
  onChange,
  hideProvider = false,
}: TunePanelProps) {
  const set = <K extends keyof BaseStackInputs>(
    key: K,
    value: BaseStackInputs[K],
  ) => onChange({ ...inputs, [key]: value });

  return (
    <div className="tune">
      {!hideProvider && (
        <section className="tune__group">
          <h3 className="tune__legend">Cloud</h3>
          <Field label="Provider">
            <Segmented
              options={PROVIDERS}
              value={inputs.provider}
              onChange={(v) => set("provider", v)}
              block
              aria-label="Cloud provider"
            />
          </Field>
        </section>
      )}

      <section className="tune__group">
        <h3 className="tune__legend">Traffic</h3>
        <Slider
          label="Read fraction"
          value={inputs.readFrac}
          min={0.5}
          max={1}
          step={0.01}
          accent="cyan"
          unit="reads"
          format={(v) => percent(v)}
          onChange={(v) => set("readFrac", v)}
          hint={`${percent(inputs.readFrac)} reads / ${percent(1 - inputs.readFrac)} writes`}
        />
      </section>

      <section className="tune__group">
        <h3 className="tune__legend">Runtime</h3>
        <div className="tune__row2">
          <Field label="Language">
            <Segmented options={LANGS} value={inputs.lang} onChange={(v) => set("lang", v)} block aria-label="Language" />
          </Field>
          <Field label="Protocol">
            <Segmented options={PROTOS} value={inputs.proto} onChange={(v) => set("proto", v)} block aria-label="Protocol" />
          </Field>
        </div>
        <div className="tune__row2">
          <Slider
            label="API vCPU / node"
            value={inputs.cores}
            min={1}
            max={16}
            step={1}
            accent="green"
            unit="vCPU"
            onChange={(v) => set("cores", v)}
          />
          <Slider
            label="RAM / node"
            value={inputs.ramGB}
            min={1}
            max={32}
            step={1}
            accent="green"
            unit="GB"
            onChange={(v) => set("ramGB", v)}
          />
        </div>
      </section>

      <section className="tune__group">
        <h3 className="tune__legend">Data</h3>
        <Field label="Datastore">
          <Segmented options={DBS} value={inputs.db} onChange={(v) => set("db", v)} wrap aria-label="Datastore" />
        </Field>
        <Field label="Cache" hint={CACHE_HINT[inputs.cache]}>
          <Segmented options={CACHES} value={inputs.cache} onChange={(v) => set("cache", v)} block aria-label="Cache" />
        </Field>
        {inputs.cache !== "none" && (
          <Slider
            label="Cache hit ratio"
            value={inputs.hitRatio}
            min={0}
            max={0.99}
            step={0.01}
            accent="cyan"
            unit="hit"
            format={(v) => percent(v)}
            onChange={(v) => set("hitRatio", v)}
            hint={
              inputs.cache === "local"
                ? `Share of reads served from cache. Local caches don't share, so ~${percent(inputs.hitRatio * 0.85)} counts (×0.85), the rest hit the datastore.`
                : "Share of reads served from cache instead of the datastore — higher means less DB load."
            }
          />
        )}
      </section>

      <section className="tune__group">
        <h3 className="tune__legend">Pricing</h3>
        <Toggle checked={inputs.managed} onChange={(v) => set("managed", v)} label="Managed DB / cache (premium)" accent="amber" />
        <Toggle checked={inputs.reserved} onChange={(v) => set("reserved", v)} label="Reserved / committed-use" accent="green" />
        <Toggle checked={inputs.egress} onChange={(v) => set("egress", v)} label="Count internet egress" accent="cyan" />
      </section>
    </div>
  );
}
