/**
 * Runway — Assumptions & Sources panel.
 *
 * GENERATED from `listConstants()` metadata — never hand-written. Editable rows
 * (those with an `editable` range) get an inline slider; every row shows its
 * source string. Edits flow up as flat dotted-path overrides and re-run the
 * model live. A reset clears any override on a row.
 */
import { useMemo, useState } from "react";
import { Slider } from "../components/index.ts";
import { listConstants } from "../../model/index.ts";

export interface AssumptionsPanelProps {
  overrides: Record<string, number>;
  onEdit: (path: string, value: number) => void;
  onReset: (path: string) => void;
}

interface Row {
  path: string;
  value: number;
  unit: string;
  source: string;
  editable?: [number, number];
}

/** Group constants by their top-level namespace for a scannable table. */
function group(rows: Row[]): Record<string, Row[]> {
  const out: Record<string, Row[]> = {};
  for (const r of rows) {
    const ns = r.path.split(".")[0] ?? "other";
    (out[ns] ??= []).push(r);
  }
  return out;
}

const NS_LABEL: Record<string, string> = {
  CAPACITY: "Capacity & cost (stack)",
  AUTHZ: "Authorization",
  ALG: "Signature algorithms",
  PRICE: "Multi-cloud price table",
  GROWTH: "Growth defaults",
};

function stepFor(editable: [number, number], value: number): number {
  const span = editable[1] - editable[0];
  if (span <= 4) return 0.01;
  if (span <= 100) return value < 5 ? 0.05 : 1;
  return Math.max(1, Math.round(span / 200));
}

export function AssumptionsPanel({
  overrides,
  onEdit,
  onReset,
}: AssumptionsPanelProps) {
  // Authorization was removed from the simulation — hide its constants here too.
  const base = useMemo(
    () =>
      (listConstants() as Row[]).filter((r) => {
        const ns = r.path.split(".")[0];
        return ns !== "AUTHZ" && ns !== "ALG";
      }),
    [],
  );
  const [filter, setFilter] = useState("");

  const rows = base.map((r) => ({
    ...r,
    value: overrides[r.path] ?? r.value,
    overridden: r.path in overrides,
  }));

  const q = filter.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.path.toLowerCase().includes(q) ||
          r.source.toLowerCase().includes(q),
      )
    : rows;

  const grouped = group(filtered);
  const editedCount = Object.keys(overrides).length;

  return (
    <div className="assump">
      <div className="assump__bar">
        <input
          className="assump__search"
          placeholder="Filter assumptions or sources…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="assump__count">
          {filtered.length} of {base.length}
          {editedCount > 0 && ` · ${editedCount} edited`}
        </span>
      </div>

      {Object.entries(grouped).map(([ns, list]) => (
        <section key={ns} className="assump__group">
          <h4 className="assump__nshead">{NS_LABEL[ns] ?? ns}</h4>
          <div className="assump__rows">
            {list.map((r) => {
              const overridden = (r as Row & { overridden: boolean }).overridden;
              return (
                <div className="assump__row" key={r.path} data-edited={overridden}>
                  <div className="assump__meta">
                    <code className="assump__path">{r.path}</code>
                    <span className="assump__source">{r.source || "—"}</span>
                  </div>
                  <div className="assump__edit">
                    {r.editable ? (
                      <Slider
                        value={r.value}
                        min={r.editable[0]}
                        max={r.editable[1]}
                        step={stepFor(r.editable, r.value)}
                        accent={overridden ? "amber" : "cyan"}
                        unit={r.unit}
                        format={(v) =>
                          Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
                        }
                        onChange={(v) => onEdit(r.path, v)}
                        aria-label={r.path}
                      />
                    ) : (
                      <span className="assump__fixed">
                        {r.value}
                        {r.unit && <em> {r.unit}</em>}
                        <span className="assump__lock" title="fixed constant">
                          fixed
                        </span>
                      </span>
                    )}
                    {overridden && (
                      <button
                        type="button"
                        className="assump__reset"
                        onClick={() => onReset(r.path)}
                        title="Reset to default"
                      >
                        reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
