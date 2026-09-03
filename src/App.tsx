/**
 * Runway — app shell.
 *
 * Hosts global state (single-design inputs, compare slots, shared growth curve,
 * constant overrides), the top-level Design | Compare tab switch, the scenario
 * toolbar (save/load/delete/share/export/import/print), URL-restore on load and
 * URL-sync on change, and the printable one-page summary.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  defaultInputs,
  TEMPLATES,
  computeStack,
  simulateGrowth,
  generateVerdict,
  GROWTH_DEFAULTS,
  money,
  ms,
  compact,
  percent,
  formatMonths,
} from "./model/index.ts";
import type {
  AuthzConfig,
  BaseStackInputs,
  GrowthInputs,
  StackInputs,
} from "./model/index.ts";
import { SingleDesignView } from "./ui/app/SingleDesignView.tsx";
import { ComparisonView } from "./ui/app/ComparisonView.tsx";
import { DatastoresView } from "./ui/app/DatastoresView.tsx";
import { HowItWorksView } from "./ui/app/HowItWorksView.tsx";
import { ScenarioBar } from "./ui/app/ScenarioBar.tsx";
import { CostOverTime } from "./ui/charts/index.ts";
import { VerdictBanner, TierGrid } from "./ui/app/results.tsx";
import { toCostSeries, toEventMarkers } from "./ui/app/chartmap.ts";
import {
  type AppMode,
  type AppState,
  type CompareSlot,
  buildShareUrl,
  deleteScenario,
  exportJson,
  importJson,
  listScenarios,
  loadScenario,
  readUrlState,
  saveScenario,
  seedExampleScenarios,
  syncUrl,
} from "./ui/app/share.ts";
import "./ui/app/app.css";

const DEFAULT_GROWTH: GrowthInputs = {
  startRps: 100_000,
  model: "exponential",
  ratePerYear: GROWTH_DEFAULTS.ratePerYear.value,
  horizonMonths: GROWTH_DEFAULTS.horizonMonths.value,
};

function defaultCompareSlots(): CompareSlot[] {
  // Teaching pair from the spec: Postgres/Java vs Cassandra/Rust.
  const a = TEMPLATES.find((t) => t.id === "postgres-monolith")!;
  const b = TEMPLATES.find((t) => t.id === "lean-read-api")!;
  return [
    { id: "slot-a", name: "Postgres / Java", inputs: { ...a.inputs } },
    { id: "slot-b", name: "Cassandra / Rust", inputs: { ...b.inputs } },
  ];
}

/** Authorization was removed from the simulation; force it off on any state
 *  arriving from a shared URL, a saved scenario, or an imported file. */
function withAuthzOff<T extends { authz: AuthzConfig }>(inputs: T): T {
  return { ...inputs, authz: { ...inputs.authz, enabled: false } };
}
function sanitize(state: AppState): AppState {
  return {
    ...state,
    single: withAuthzOff(state.single),
    compare: state.compare.map((c) => ({ ...c, inputs: withAuthzOff(c.inputs) })),
  };
}

function initialState(): AppState {
  const fromUrl = readUrlState();
  if (fromUrl) return sanitize(fromUrl);
  return {
    v: 1,
    mode: "single",
    single: defaultInputs("aws"),
    compare: defaultCompareSlots(),
    growth: DEFAULT_GROWTH,
    overrides: {},
  };
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState);
  const [saved, setSaved] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    seedExampleScenarios();
    setSaved(listScenarios());
  }, []);

  // keep the URL shareable as state changes (debounced via rAF is overkill —
  // replaceState is cheap).
  useEffect(() => {
    syncUrl(state);
  }, [state]);

  const flashMsg = useCallback((msg: string) => {
    setFlash(msg);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2200);
  }, []);

  const setMode = (mode: AppMode) => setState((s) => ({ ...s, mode }));
  const setSingle = (single: StackInputs) => setState((s) => ({ ...s, single }));
  const setSlots = (compare: CompareSlot[]) => setState((s) => ({ ...s, compare }));
  const setGrowth = (growth: GrowthInputs) => setState((s) => ({ ...s, growth }));

  const onOverrideEdit = (path: string, value: number) =>
    setState((s) => ({ ...s, overrides: { ...s.overrides, [path]: value } }));
  const onOverrideReset = (path: string) =>
    setState((s) => {
      const next = { ...s.overrides };
      delete next[path];
      return { ...s, overrides: next };
    });

  /* ---- scenario actions ---- */
  const handleSave = (name: string) => {
    saveScenario(name, state);
    setSaved(listScenarios());
    flashMsg(`Saved “${name}”`);
  };
  const handleLoad = (name: string) => {
    const loaded = loadScenario(name);
    if (loaded) {
      setState(sanitize(loaded));
      flashMsg(`Loaded “${name}”`);
    }
  };
  const handleDelete = (name: string) => {
    deleteScenario(name);
    setSaved(listScenarios());
    flashMsg(`Deleted “${name}”`);
  };
  const handleShare = async () => {
    const url = buildShareUrl(state);
    try {
      await navigator.clipboard.writeText(url);
      flashMsg("Share link copied to clipboard");
    } catch {
      // clipboard blocked — drop it in the URL bar at least.
      syncUrl(state);
      flashMsg("Share link is in the address bar");
    }
  };
  const handleExport = () => {
    const blob = new Blob([exportJson(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "runway-scenario.json";
    a.click();
    URL.revokeObjectURL(url);
    flashMsg("Exported scenario JSON");
  };
  const handleImport = (text: string) => {
    const parsed = importJson(text);
    if (parsed) {
      setState(sanitize(parsed));
      flashMsg("Imported scenario");
    } else {
      flashMsg("Could not parse that file");
    }
  };
  const handlePrint = () => window.print();

  return (
    <div className="app">
      <header className="header no-print">
        <div className="header__brand">
          <span className="header__mark">runway</span>
          <span className="header__tag">
            Size &amp; cost a request-serving stack as it grows — across any cloud.
          </span>
        </div>
        <nav className="header__tabs" aria-label="View">
          <button
            type="button"
            className={["tab", state.mode === "single" && "tab--on"].filter(Boolean).join(" ")}
            onClick={() => setMode("single")}
            aria-pressed={state.mode === "single"}
          >
            Design
          </button>
          <button
            type="button"
            className={["tab", state.mode === "compare" && "tab--on"].filter(Boolean).join(" ")}
            onClick={() => setMode("compare")}
            aria-pressed={state.mode === "compare"}
          >
            Compare
          </button>
          <button
            type="button"
            className={["tab", state.mode === "datastores" && "tab--on"].filter(Boolean).join(" ")}
            onClick={() => setMode("datastores")}
            aria-pressed={state.mode === "datastores"}
          >
            Datastores
          </button>
          <button
            type="button"
            className={["tab", state.mode === "howitworks" && "tab--on"].filter(Boolean).join(" ")}
            onClick={() => setMode("howitworks")}
            aria-pressed={state.mode === "howitworks"}
          >
            How it works
          </button>
        </nav>
      </header>

      <div className="no-print">
        <ScenarioBar
          saved={saved}
          onSave={handleSave}
          onLoad={handleLoad}
          onDelete={handleDelete}
          onExport={handleExport}
          onImport={handleImport}
          onShare={handleShare}
          onPrint={handlePrint}
          flash={flash}
        />
      </div>

      <main className="main no-print">
        {state.mode === "single" ? (
          <SingleDesignView
            inputs={state.single}
            growth={state.growth}
            overrides={state.overrides}
            onInputs={setSingle}
            onGrowth={setGrowth}
            onOverrideEdit={onOverrideEdit}
            onOverrideReset={onOverrideReset}
          />
        ) : state.mode === "compare" ? (
          <ComparisonView
            slots={state.compare}
            growth={state.growth}
            overrides={state.overrides}
            onSlots={setSlots}
            onGrowth={setGrowth}
          />
        ) : state.mode === "datastores" ? (
          <DatastoresView />
        ) : (
          <HowItWorksView inputs={state.single} overrides={state.overrides} />
        )}
      </main>

      <PrintSummary state={state} />

      <footer className="footer no-print">
        <span>
          runway · model defaults are AWS-verified (MODEL-SPEC Appx A/B); GCP / Azure / on-prem are sourced, editable estimates.
        </span>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* printable one-page summary (single design)                                 */
/* -------------------------------------------------------------------------- */

function PrintSummary({ state }: { state: AppState }) {
  const inputs = state.single;
  const { rps: _rps, ...base } = inputs;
  const growth: GrowthInputs = { ...state.growth, startRps: inputs.rps };
  const result = simulateGrowth(base as BaseStackInputs, growth, state.overrides);
  const snap = computeStack(inputs, state.overrides);
  const verdict = generateVerdict(result);

  return (
    <section className="printpage print-only">
      <header className="printpage__head">
        <h1>runway — capacity &amp; cost summary</h1>
        <p className="printpage__when">
          {inputs.provider.toUpperCase()} · {inputs.lang}/{inputs.proto} · {inputs.db} ·{" "}
          {inputs.cache} cache · {compact(inputs.rps)} rps today
        </p>
      </header>

      <VerdictBanner verdict={verdict} />

      <div className="printpage__stats">
        <div>
          <b>{money(snap.total)}/mo</b>
          <span>cost now</span>
        </div>
        <div>
          <b>{result.runwayMonths === null ? "No wall" : formatMonths(result.runwayMonths)}</b>
          <span>time to wall</span>
        </div>
        <div>
          <b>{ms(snap.p99)}</b>
          <span>p99 now</span>
        </div>
        <div>
          <b>{percent(snap.maxUtil)}</b>
          <span>{snap.bottleneck} util</span>
        </div>
      </div>

      <h2>Cost trajectory</h2>
      <CostOverTime
        series={toCostSeries(result, "This design")}
        events={toEventMarkers(result.events)}
        height={200}
      />

      <h2>Stack today</h2>
      <TierGrid now={snap} />

      <h2>Key assumptions</h2>
      <ul className="printpage__assump">
        <li>Growth: {growth.model}, +{percent(growth.ratePerYear)}/yr, {formatMonths(growth.horizonMonths)} horizon.</li>
        <li>Read/write mix: {percent(inputs.readFrac)} reads.</li>
        <li>
          API nodes: {inputs.cores} vCPU / {inputs.ramGB} GB ·{" "}
          {inputs.reserved ? "reserved" : "on-demand"} pricing{inputs.managed ? " · managed DB/cache" : ""}.
        </li>
        {Object.keys(state.overrides).length > 0 && (
          <li>
            Edited constants:{" "}
            {Object.entries(state.overrides)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}
            .
          </li>
        )}
      </ul>

      <footer className="printpage__foot">
        runway · planning estimates; AWS defaults verified (MODEL-SPEC Appx A/B), other clouds sourced &amp; editable.
      </footer>
    </section>
  );
}
