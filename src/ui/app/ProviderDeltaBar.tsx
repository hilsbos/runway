/**
 * Runway — per-cloud cost comparison bars.
 *
 * Shows the same design costed across AWS / GCP / Azure / on-prem, with Δ% vs
 * the currently-selected provider. Click a bar to switch the design's provider.
 */
import type { Provider } from "../../model/index.ts";
import { money, deltaPercent } from "../../model/index.ts";

export interface ProviderDeltaBarProps {
  deltas: Record<
    Provider,
    { total: number; deltaVsBaseUsd: number; deltaVsBasePct: number }
  >;
  selected: Provider;
  onSelect: (p: Provider) => void;
}

const ORDER: Provider[] = ["aws", "gcp", "azure", "onprem"];
const LABEL: Record<Provider, string> = {
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  onprem: "On-prem",
};

export function ProviderDeltaBar({
  deltas,
  selected,
  onSelect,
}: ProviderDeltaBarProps) {
  const max = Math.max(...ORDER.map((p) => deltas[p].total), 1);

  return (
    <div className="pclouds">
      {ORDER.map((p) => {
        const d = deltas[p];
        const pct = (d.total / max) * 100;
        const isSel = p === selected;
        const cheaper = d.deltaVsBasePct < -0.001;
        const pricier = d.deltaVsBasePct > 0.001;
        return (
          <button
            key={p}
            type="button"
            className={["pcloud", isSel && "pcloud--sel"].filter(Boolean).join(" ")}
            onClick={() => onSelect(p)}
            aria-pressed={isSel}
          >
            <div className="pcloud__head">
              <span className="pcloud__name">{LABEL[p]}</span>
              <span className="pcloud__cost">{money(d.total)}</span>
            </div>
            <div className="pcloud__track">
              <span
                className="pcloud__fill"
                data-tone={isSel ? "sel" : cheaper ? "good" : pricier ? "bad" : "flat"}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div
              className="pcloud__delta"
              data-tone={isSel ? "flat" : cheaper ? "good" : pricier ? "bad" : "flat"}
            >
              {isSel ? "selected" : deltaPercent(d.deltaVsBasePct)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
